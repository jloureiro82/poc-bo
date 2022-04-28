import { Component, Input, ViewChild } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatDatepicker } from '@angular/material/datepicker'

@Component({
  selector: 'app-form-datepicker',
  templateUrl: './form-datepicker.component.html',
  styleUrls: ['./form-datepicker.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi:true,
      useExisting: FormDatepickerComponent
    }
  ]
})
export class FormDatepickerComponent {

  @Input() title!: string
  @Input() name!: string
  @Input() icon!: string
  @Input() value = ''
  @Input('formControl') formControl!: FormControl
  @ViewChild('myDatepicker') datepicker!: MatDatepicker<any>
  
  public onChange = (value: any) => this.value = value
  private onTouched = () => {}

  constructor() { }

  showDatepicker() {
    this.datepicker.open()
  }

  inputChange(event: any) {
    this.onTouched()
    this.onChange(event?.target?.value || '')
  }

  writeValue(value: string): void {
    this.value = value
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }

}
