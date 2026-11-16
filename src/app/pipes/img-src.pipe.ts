import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Turns a product's image_url into something an <img> can load.
 *  - "/uploads/abc.jpg" (a file uploaded to our API) -> "http://localhost:3000/uploads/abc.jpg"
 *  - "https://..." links are used as they are.
 */
@Pipe({ name: 'imgSrc', standalone: true })
export class ImgSrcPipe implements PipeTransform {
  private readonly apiOrigin = environment.apiUrl.replace(/\/api\/?$/, '');

  transform(url: string | null | undefined): string {
    if (!url) return '';
    return url.startsWith('/uploads/') ? this.apiOrigin + url : url;
  }
}
