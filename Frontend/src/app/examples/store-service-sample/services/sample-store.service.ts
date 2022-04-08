import { Injectable } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs'
@Injectable({
  providedIn: 'root'
})
export class SampleStoreService {

  private store$ = new BehaviorSubject<any>({})
  constructor() { }

  update(next: any) {
    this.store$.next(next)
  }

  getObserver() {
    return this.store$.pipe()
  }

  mock() {
    return of([
      {name: 'professional', cost: 100},
      {name: 'personal', cost: 30}
    ])
  }
}
