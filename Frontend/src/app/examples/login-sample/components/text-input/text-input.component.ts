import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';

@Component({
  selector: 'app-text-input',
  templateUrl: './text-input.component.html',
  styleUrls: ['./text-input.component.css']
})
export class TextInputComponent implements OnInit, AfterViewInit {

  @Input('name') name!: string
  @Input('placeholder') placeholder!: string
  @Input('symbol') symbol!: string
  @Input('validate') validate!: string
  @Input('type') type = 'text'
  @ViewChild('input') input!: ElementRef
  
  @Input('appFormField') formControl = new FormControl()

  constructor(private element: ElementRef) { }

  isValid() {
    return this.formControl.valid
  }
  ngAfterViewInit(): void {
    this.input.nativeElement.addEventListener('focus', () => { this.formControl.setErrors(null)})
  }

  ngOnInit(): void {
    //injecting direct into template via data-validate="{{validate}}" was not working
    this.element.nativeElement.firstElementChild.setAttribute("data-validate", this.validate)
  }

}
