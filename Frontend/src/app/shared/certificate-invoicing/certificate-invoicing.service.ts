import { Injectable } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CertificateInvoicingService {
  selectedOrder!: String

  private store$ = new BehaviorSubject<any>({})

  constructor() { }

  update(next: any) {
    this.store$.next(next)
  }

  getObserver() {
    return this.store$.pipe()
  }

}
