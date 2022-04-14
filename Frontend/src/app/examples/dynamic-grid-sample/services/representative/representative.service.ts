import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { RepresentativeModel } from 'src/app/shared/dynamic-grid/models/RepresentativeModel';
import { HandleError, HttpErrorHandler } from 'src/app/shared/handlers/http-error-handler/http-error-handler.service';
import { catchError, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RepresentativeService {
  url = environment.postmanApiUrl + 'client/1/order/123/doc/representative'
  private handleError: HandleError;

  constructor(private http: HttpClient,
    httpErrorHandler: HttpErrorHandler) { 
      this.handleError = httpErrorHandler.createHandleError('RepresentativeService');
    }

  getRepresentative(): Observable<RepresentativeModel[]> {
    return this.http.get<RepresentativeModel[]>(this.url)
    .pipe(
      catchError(this.handleError('getRepresentative', []))
    )
  }
}
