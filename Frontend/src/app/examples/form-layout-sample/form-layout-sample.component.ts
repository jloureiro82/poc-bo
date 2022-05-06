import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-form-layout-sample',
  templateUrl: './form-layout-sample.component.html',
  styleUrls: ['./form-layout-sample.component.css']
})
export class FormLayoutSampleComponent implements OnInit {

  value = {num:1, text: ''}
  constructor() { 

  }
  addVal() {
    this.value.num = this.value.num + 1
  }
  subVal(event: Event) {
    this.value.num = this.value.num - 1
  }
  txtChange(ev: any) {
    this.value.text = ev.target.value
  }

  ngOnInit(): void {
  }

}
