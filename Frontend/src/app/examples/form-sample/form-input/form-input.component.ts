import { Component, Input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';


@Component({
  selector: 'app-form-input',
  templateUrl: './form-input.component.html',
  styleUrls: ['./form-input.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi:true,
      useExisting: FormInputComponent
    }
  ]
})
export class FormInputComponent implements ControlValueAccessor {

  @Input() title!: string
  @Input() name!: string
  @Input() icon!: string
  @Input() type = 'text'

  @Input() value = ''

  public onChange = (value: any) => this.value = value
  private onTouched = () => {}

  constructor() { }

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
