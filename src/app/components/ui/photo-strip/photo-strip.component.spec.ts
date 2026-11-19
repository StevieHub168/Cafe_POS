import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PhotoStripComponent } from './photo-strip.component';

describe('PhotoStripComponent', () => {
  let fixture: ComponentFixture<PhotoStripComponent>;
  const dom = () => fixture.nativeElement as HTMLElement;

  async function create(photos: string[] | null | undefined): Promise<void> {
    await TestBed.configureTestingModule({ imports: [PhotoStripComponent] }).compileComponents();
    fixture = TestBed.createComponent(PhotoStripComponent);
    fixture.componentRef.setInput('photos', photos);
    fixture.detectChanges();
  }

  it('shows each photo as a small square that opens the picture in a new tab', async () => {
    await create(['/uploads/a.png', 'https://example.com/b.jpg']);
    const links = Array.from(dom().querySelectorAll('ul[aria-label="Photos"] a')) as HTMLAnchorElement[];
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('href')).toContain('/uploads/a.png');
    expect(links[1].getAttribute('href')).toBe('https://example.com/b.jpg');
    links.forEach(a => {
      expect(a.target).toBe('_blank');
      expect(a.rel).toContain('noopener');
      expect(a.querySelector('img')).not.toBeNull();
    });
  });

  it('shows nothing when there are no photos (empty, null or missing)', async () => {
    for (const none of [[], null, undefined]) {
      TestBed.resetTestingModule();
      await create(none);
      expect(dom().querySelector('ul')).toBeNull();
    }
  });
});
