import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { PhotoUploadComponent } from './photo-upload.component';
import { ProductService } from '../../../services/product.service';

const file = (name: string, type = 'image/png', size = 100) => new File([new Uint8Array(size)], name, { type });

describe('PhotoUploadComponent', () => {
  let fixture: ComponentFixture<PhotoUploadComponent>;
  let component: PhotoUploadComponent;
  let api: { [k: string]: jasmine.Spy };
  let emitted: string[][];
  let uploading: boolean[];
  let counter: number;

  async function create(photos: string[] = [], max = 4): Promise<void> {
    counter = 0;
    emitted = [];
    uploading = [];
    api = {
      uploadImage: jasmine.createSpy('uploadImage').and.callFake(() => of({ url: `/uploads/new-${++counter}.png` })),
      discardImage: jasmine.createSpy('discardImage').and.returnValue(of({ message: 'Photo removed' })),
    };
    await TestBed.configureTestingModule({
      imports: [PhotoUploadComponent],
      providers: [{ provide: ProductService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(PhotoUploadComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('photos', photos);
    fixture.componentRef.setInput('max', max);
    component.photosChange.subscribe(list => emitted.push(list));
    component.uploadingChange.subscribe(flag => uploading.push(flag));
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => dom().textContent ?? '';
  const choose = (files: File[]) => {
    const input = { files, value: 'C:\\fakepath\\x' };
    component.onFilesSelected({ target: input } as unknown as Event);
    fixture.detectChanges();
    return input;
  };
  const camera = (files: File[]) => component.onCameraPhoto({ target: { files, value: 'x' } } as unknown as Event);
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 100 && !done(); i++) await new Promise(resolve => setTimeout(resolve, 30));
    expect(done()).toBeTrue();
  };
  const thumbs = () => Array.from(dom().querySelectorAll('ul[aria-label="All photos"] li')) as HTMLElement[];
  const preview = () => dom().querySelector('img[alt="Photo preview"]') as HTMLImageElement | null;
  const clickButton = (label: string) => (Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement).click();
  const fileInputs = () => Array.from(dom().querySelectorAll('input[type="file"]')) as HTMLInputElement[];
  const last = () => emitted[emitted.length - 1];

  it('should create', async () => {
    await create();
    expect(component).toBeTruthy();
  });

  describe('what it shows', () => {
    it('a label, "Choose files", and the file-type hint; no photos yet', async () => {
      await create();
      expect(text()).toContain('Photos');
      expect(text()).toContain('Choose files');
      expect(text()).toContain('PNG, JPG, WEBP or GIF · up to 5 MB each');
      expect(thumbs().length).toBe(0);
    });

    it('the label and hint can be changed', async () => {
      await create();
      fixture.componentRef.setInput('label', 'Photos (e.g. deposit receipt)');
      fixture.componentRef.setInput('hint', 'Only pictures');
      fixture.detectChanges();
      expect(text()).toContain('Photos (e.g. deposit receipt)');
      expect(text()).toContain('Only pictures');
    });

    it('no photo yet: an empty preview that says so, and no small pictures', async () => {
      await create();
      expect(preview()).toBeNull();
      expect(text()).toContain('No photo yet');
      expect(thumbs().length).toBe(0);
      expect(text()).not.toContain('Remove photo');
    });

    it('one photo: a big preview, "Add photos" and "Remove photo", and a count; no row of small pictures', async () => {
      await create(['/uploads/a.png']);
      expect(preview()!.getAttribute('src')).toContain('/uploads/a.png');
      expect(thumbs().length).toBe(0);
      expect(text()).toContain('1 / 4');
      expect(text()).toContain('Add photos');
      clickButton('Remove photo');
      expect(last()).toEqual([]);
    });

    it('several photos: a small picture for each with a ✕, and a click shows that one big', async () => {
      await create(['/uploads/a.png', 'https://img.example.com/b.jpg']);
      expect(thumbs().length).toBe(2);
      expect(preview()!.getAttribute('src')).toContain('/uploads/a.png');
      expect(thumbs()[1].querySelector('img')!.getAttribute('src')).toBe('https://img.example.com/b.jpg');
      expect(thumbs()[0].querySelector('button[aria-label="Remove photo 1"]')).not.toBeNull();
      (thumbs()[1].querySelector('button[aria-label="Show photo 2"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(preview()!.getAttribute('src')).toBe('https://img.example.com/b.jpg');
      expect(text()).toContain('2 / 4');
    });

    it('"Remove photo" removes the one that is big', async () => {
      await create(['/uploads/a.png', '/uploads/b.png']);
      (thumbs()[1].querySelector('button[aria-label="Show photo 2"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      clickButton('Remove photo');
      expect(last()).toEqual(['/uploads/a.png']);
    });

    it('the photo that was just added is the one shown big', async () => {
      await create(['/uploads/a.png']);
      choose([file('b.png')]);
      expect(preview()!.getAttribute('src')).toContain('/uploads/new-1.png');
    });

    describe('with a lead photo (the laptop\'s own)', () => {
      const withLead = async (photos: string[] = []) => {
        await create(photos);
        fixture.componentRef.setInput('lead', '/uploads/laptop.png');
        fixture.detectChanges();
      };

      it('is shown first and big, marked "Laptop", with no Remove button', async () => {
        await withLead();
        expect(preview()!.getAttribute('src')).toContain('/uploads/laptop.png');
        expect(text()).toContain('Laptop');
        expect(text()).not.toContain('Remove photo');
        expect(text()).toContain('Add photos');
      });

      it('is not counted and is not in the list the parent gets', async () => {
        await withLead(['/uploads/a.png']);
        expect(text()).toContain('1 / 4');
        expect(component.photos).toEqual(['/uploads/a.png']);
        expect(thumbs().length).toBe(2);
        expect(thumbs()[0].textContent).toContain('Laptop');
        expect(thumbs()[0].querySelector('button[aria-label^="Remove photo"]')).toBeNull();
      });

      it('the ✕ of the next photo removes that photo, not the laptop', async () => {
        await withLead(['/uploads/a.png', '/uploads/b.png']);
        (thumbs()[1].querySelector('button[aria-label="Remove photo 1"]') as HTMLButtonElement).click();
        expect(last()).toEqual(['/uploads/b.png']);
      });

      it('"Remove photo" works on an added photo that is big', async () => {
        await withLead(['/uploads/a.png']);
        (thumbs()[1].querySelector('button[aria-label="Show photo 2"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        clickButton('Remove photo');
        fixture.detectChanges();
        expect(last()).toEqual([]);
        expect(preview()!.getAttribute('src')).toContain('/uploads/laptop.png');
      });
    });
  });

  describe('choosing files', () => {
    it('uploads them one after another and reports the growing list, in the order chosen', async () => {
      await create();
      choose([file('a.png'), file('b.png'), file('c.png')]);
      expect(api['uploadImage']).toHaveBeenCalledTimes(3);
      expect(last()).toEqual(['/uploads/new-1.png', '/uploads/new-2.png', '/uploads/new-3.png']);
      expect(component.photos.length).toBe(3);
      expect(thumbs().length).toBe(3);
    });

    it('files that arrive together do not overwrite each other', async () => {
      await create(['/uploads/old.png']);
      choose([file('a.png'), file('b.png')]);
      expect(last()).toEqual(['/uploads/old.png', '/uploads/new-1.png', '/uploads/new-2.png']);
    });

    it('says it is uploading while pictures are on their way, then stops', async () => {
      await create();
      const pending = new Subject<{ url: string }>();
      api['uploadImage'].and.returnValue(pending);
      choose([file('a.png')]);
      expect(component.isUploading).toBeTrue();
      expect(uploading).toEqual([true]);
      expect(dom().querySelector('[aria-label="Uploading"]')).not.toBeNull();
      pending.next({ url: '/uploads/x.png' });
      pending.complete();
      fixture.detectChanges();
      expect(component.isUploading).toBeFalse();
      expect(uploading).toEqual([true, false]);
      expect(dom().querySelector('[aria-label="Uploading"]')).toBeNull();
    });

    it('clears the field so the same file can be chosen again', async () => {
      await create();
      expect(choose([file('a.png')]).value).toBe('');
    });

    it('refuses what is not a PNG / JPG / WEBP / GIF picture, but still uploads the good ones', async () => {
      await create();
      choose([file('notes.pdf', 'application/pdf'), file('ok.png')]);
      expect(text()).toContain('“notes.pdf” is not a PNG, JPG, WEBP or GIF image.');
      expect(api['uploadImage']).toHaveBeenCalledTimes(1);
      expect(last()).toEqual(['/uploads/new-1.png']);
    });

    it('refuses a picture over 5 MB', async () => {
      await create();
      choose([file('huge.png', 'image/png', 5 * 1024 * 1024 + 1)]);
      expect(text()).toContain('“huge.png” is too big. The limit is 5 MB.');
      expect(api['uploadImage']).not.toHaveBeenCalled();
    });

    it('a failed upload shows the reason and the others carry on', async () => {
      await create();
      api['uploadImage'].and.returnValues(
        throwError(() => ({ error: { error: 'That file is not a valid image' } })),
        of({ url: '/uploads/second.png' })
      );
      choose([file('bad.png'), file('good.png')]);
      expect(text()).toContain('“bad.png”: That file is not a valid image');
      expect(last()).toEqual(['/uploads/second.png']);
      expect(component.isUploading).toBeFalse();
    });

    it('a failed upload with no reason from the server says to try again', async () => {
      await create();
      api['uploadImage'].and.returnValue(throwError(() => new Error('offline')));
      choose([file('a.png')]);
      expect(text()).toContain('Upload failed. Please try again.');
    });

    it('stops at the limit: only what fits is uploaded, and it says so', async () => {
      await create(['/uploads/1.png', '/uploads/2.png'], 4);
      choose([file('a.png'), file('b.png'), file('c.png'), file('d.png')]);
      expect(api['uploadImage']).toHaveBeenCalledTimes(2);
      expect(component.photos.length).toBe(4);
      expect(text()).toContain('Only 4 photos.');
    });

    it('both buttons are switched off when it is full', async () => {
      await create(['/uploads/1.png', '/uploads/2.png'], 2);
      expect(component.canAdd).toBeFalse();
      expect(fileInputs().every(input => input.disabled)).toBeTrue();
    });
  });

  describe('dragging and pasting', () => {
    it('dropping pictures uploads them (and the box is highlighted while dragging over)', async () => {
      await create();
      const over = new Event('dragover', { cancelable: true }) as DragEvent;
      component.onDragOver(over);
      fixture.detectChanges();
      expect(over.defaultPrevented).toBeTrue();
      expect(component.isDragging).toBeTrue();
      expect(dom().querySelector('.border-primary-400')).not.toBeNull();

      component.onDrop({ preventDefault() {}, dataTransfer: { files: [file('a.png'), file('b.png')] } } as unknown as DragEvent);
      expect(component.isDragging).toBeFalse();
      expect(last()).toEqual(['/uploads/new-1.png', '/uploads/new-2.png']);
    });

    it('a drop with no files does nothing', async () => {
      await create();
      component.onDrop({ preventDefault() {}, dataTransfer: { files: [] } } as unknown as DragEvent);
      expect(api['uploadImage']).not.toHaveBeenCalled();
    });

    it('pasting a copied picture or screenshot (Ctrl/⌘ + V) uploads it', async () => {
      await create();
      const prevent = jasmine.createSpy('preventDefault');
      component.onPaste({ clipboardData: { files: [file('image.png')] }, preventDefault: prevent } as unknown as ClipboardEvent);
      expect(prevent).toHaveBeenCalled();
      expect(last()).toEqual(['/uploads/new-1.png']);
    });

    it('pasting text is left alone (typing in other boxes still works)', async () => {
      await create();
      const prevent = jasmine.createSpy('preventDefault');
      component.onPaste({ clipboardData: { files: [] }, preventDefault: prevent } as unknown as ClipboardEvent);
      component.onPaste({ clipboardData: { files: [file('x.txt', 'text/plain')] }, preventDefault: prevent } as unknown as ClipboardEvent);
      expect(prevent).not.toHaveBeenCalled();
      expect(api['uploadImage']).not.toHaveBeenCalled();
    });

    it('a real paste event on the page reaches it', async () => {
      await create();
      const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', { value: { files: [file('shot.png')] } });
      document.dispatchEvent(event);
      expect(last()).toEqual(['/uploads/new-1.png']);
    });
  });

  describe('taking a photo (touch devices only)', () => {
    const bigShot = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3200;
      canvas.height = 2400;
      canvas.getContext('2d')!.fillRect(0, 0, 3200, 2400);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
      return new File([blob], 'IMG_1.png', { type: 'image/png' });
    };

    it('no camera button on a computer', async () => {
      await create();
      spyOnProperty(component, 'canTakePhoto', 'get').and.returnValue(false);
      fixture.detectChanges();
      expect(text()).not.toContain('Take photo');
    });

    it('on a phone: a "Take photo" button that opens the back camera for one picture', async () => {
      await create();
      spyOnProperty(component, 'canTakePhoto', 'get').and.returnValue(true);
      fixture.detectChanges();
      expect(text()).toContain('Take photo');
      const input = dom().querySelector('input[capture]') as HTMLInputElement;
      expect(input.getAttribute('capture')).toBe('environment');
      expect(input.accept).toBe('image/*');
      expect(input.multiple).toBeFalse();
    });

    it('the picture is made smaller, uploaded, and added', async () => {
      await create();
      camera([await bigShot()]);
      expect(component.isUploading).toBeTrue();                      // while it is being made smaller
      await until(() => component.photos.length === 1);
      const sent = api['uploadImage'].calls.mostRecent().args[0] as File;
      expect(sent.type).toBe('image/jpeg');
      expect(sent.name).toMatch(/^camera-\d+\.jpg$/);
      expect(component.isUploading).toBeFalse();
    });

    it('nothing happens when the camera is closed without a picture, or when it is full', async () => {
      await create(['/uploads/1.png'], 1);
      camera([]);
      camera([await bigShot()]);
      expect(api['uploadImage']).not.toHaveBeenCalled();
      expect(component.pendingUploads).toBe(0);
    });
  });

  describe('removing and cleaning up', () => {
    it('removing a photo uploaded here deletes it from the server right away', async () => {
      await create();
      choose([file('a.png'), file('b.png')]);
      component.remove(0);
      expect(last()).toEqual(['/uploads/new-2.png']);
      expect(api['discardImage']).toHaveBeenCalledOnceWith('/uploads/new-1.png');
    });

    it('removing a photo that was already saved only takes it off the list (the server cleans up when you save)', async () => {
      await create(['/uploads/saved.png']);
      component.remove(0);
      expect(last()).toEqual([]);
      expect(api['discardImage']).not.toHaveBeenCalled();
    });

    it('the ✕ button removes that photo', async () => {
      await create(['/uploads/a.png', '/uploads/b.png']);
      (dom().querySelector('button[aria-label="Remove photo 2"]') as HTMLButtonElement).click();
      expect(last()).toEqual(['/uploads/a.png']);
    });

    it('removing something that is not there does nothing', async () => {
      await create(['/uploads/a.png']);
      component.remove(5);
      expect(emitted.length).toBe(0);
    });

    it('when the box goes away without saving, the pictures uploaded in it are deleted - but not the saved ones', async () => {
      await create(['/uploads/saved.png']);
      choose([file('a.png'), file('b.png')]);
      fixture.destroy();
      expect(api['discardImage'].calls.allArgs().map(a => a[0]).sort()).toEqual(['/uploads/new-1.png', '/uploads/new-2.png']);
    });

    it('after markSaved() nothing is thrown away', async () => {
      await create();
      choose([file('a.png')]);
      component.markSaved();
      component.remove(0);
      fixture.destroy();
      expect(api['discardImage']).not.toHaveBeenCalled();
    });

    it('a picture that finishes uploading after the box was closed is deleted, not added', async () => {
      await create();
      const pending = new Subject<{ url: string }>();
      api['uploadImage'].and.returnValue(pending);
      choose([file('a.png')]);
      fixture.destroy();
      pending.next({ url: '/uploads/late.png' });
      pending.complete();
      expect(api['discardImage']).toHaveBeenCalledOnceWith('/uploads/late.png');
      expect(emitted.length).toBe(0);
    });

    it('a failed delete never breaks anything', async () => {
      await create();
      choose([file('a.png')]);
      api['discardImage'].and.returnValue(throwError(() => new Error('nope')));
      expect(() => component.remove(0)).not.toThrow();
    });
  });
});
