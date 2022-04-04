import { Injectable } from '@angular/core';
import { of, tap, delay } from 'rxjs';
   
@Injectable({
  providedIn: 'root'
})  
export class ExampleService {
 
  constructor() {}
   
  getExample(payload: string) {
    return of('response example :'+ payload)
    .pipe(delay(2000))
  }  
}  