import { Component, Input, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-form-input',
  templateUrl: './form-input.component.html',
  styleUrls: ['./form-input.component.css']
})
export class FormInputComponent implements OnInit {

  @Input() title!: string
  @Input() name!: string
  @Input() icon!: string
  @Input() formField = new FormControl('')
  constructor() { }

  ngOnInit(): void {
  }

}
