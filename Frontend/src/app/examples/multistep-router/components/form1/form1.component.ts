import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';


@Component({
  selector: 'app-form1',
  templateUrl: './form1.component.html',
  styleUrls: ['./form1.component.css']
})
export class Form1Component implements OnInit {
  public myForm: FormGroup = this.fb.group({});
  public form2Data!: any;

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
  }

}
