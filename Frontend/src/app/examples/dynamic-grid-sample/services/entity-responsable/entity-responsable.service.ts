import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Observable, catchError } from 'rxjs';
import { HandleError, HttpErrorHandler } from '../../../../shared/handlers/http-error-handler/http-error-handler.service';
import { EntityResponsableModel } from 'src/app/examples/dynamic-grid-sample/models/EntityResponsableModel';

@Injectable({
  providedIn: 'root'
})
export class EntityResponsableService {
  url = "";
  private handleError: HandleError;

  constructor(private http: HttpClient,
    httpErrorHandler: HttpErrorHandler) { 
      this.handleError = httpErrorHandler.createHandleError('EntityResponsableService');
    }

  getEntityResponsable(): Observable<EntityResponsableModel[]> {
    return this.http.get<EntityResponsableModel[]>(this.url)
    .pipe(
      catchError(this.handleError('getEntityResponsableService', []))
    )
  }

  setOrder(orderNumber: String): void {
    this.url =  environment.postmanApiUrl + 'client/1/order/'+ orderNumber +'/doc/entity-responsable';
  }
}
