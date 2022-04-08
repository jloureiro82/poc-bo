import { Component, OnInit } from '@angular/core';
import { SampleStoreService } from '../services/sample-store.service';

@Component({
  selector: 'app-side-view',
  templateUrl: './side-view.component.html',
  styleUrls: ['./side-view.component.css']
})
export class SideViewComponent implements OnInit {

  public store$ = this.sampleStore.getObserver();

  constructor(private sampleStore: SampleStoreService) { }

  ngOnInit(): void {
  }

}
