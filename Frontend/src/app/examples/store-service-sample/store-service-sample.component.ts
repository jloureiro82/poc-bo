import { Component, OnInit } from '@angular/core';
import { SampleStoreService } from './services/sample-store.service';

@Component({
  selector: 'app-store-service-sample',
  templateUrl: './store-service-sample.component.html',
  styleUrls: ['./store-service-sample.component.css']
})
export class StoreServiceSampleComponent implements OnInit {

  constructor(public sampleStore: SampleStoreService) { }

  ngOnInit(): void {
  }

  onClick(cost: Number) {
    this.sampleStore.update({price: cost})
  }

}
