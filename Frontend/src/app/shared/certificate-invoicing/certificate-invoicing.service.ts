import { EventEmitter, Injectable, Output } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CertificateInvoicingService {
  orderNumber!: string;

  selectedOrder:EventEmitter<string> = new EventEmitter();

  constructor() { }

  setSelectedOrder(orderId: string){
    this.orderNumber = orderId;
    this.selectedOrder.emit(orderId);
  }

  getSelectedOrder(){
    return this.orderNumber;
  }

}
