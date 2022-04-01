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
    console.log(event)
    this.value.num = this.value.num - 1
  }
  txtChange(ev: any) {
    console.log(ev)
    this.value.text = ev.target.value
  }


  ngOnInit(): void {
  }

}
