import { AfterContentInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

interface Option {
  id: string
  name: string
}

@Component({
  selector: 'app-form-dropdown',
  templateUrl: './form-dropdown.component.html',
  styleUrls: ['./form-dropdown.component.css'],
    providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi:true,
      useExisting: FormDropdownComponent
    }
  ]
})
export class FormDropdownComponent implements AfterContentInit, ControlValueAccessor {

  @ViewChild('details') dropdown!: ElementRef
  @Input() default = 'Select an option'
  @Input() options :Option[] = []

  selected: Option = {id: '', name: ''}

  public onChange = (value: string) => console.log('onchange', value)
  private onTouched = () => {}

  constructor() { }

  writeValue(selected: string): void {
    this.selected = this.options.filter(option => option.id === selected).pop() || {id: '', name: this.default}
    console.log('wv', selected)
  }
  registerOnChange(fn: any): void {
    console.log('onchange reg', fn)
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    console.log('reg touched')
    this.onTouched = fn
  }

  ngAfterContentInit(): void {
    if (this.selected.id === '') {
      this.selected.name = this.default
    }
  }

  select(id: string) {
    console.log('id select', id)
    this.onTouched()
    this.dropdown.nativeElement.open = false
    this.writeValue(id)
    this.onChange(id)
  }
}
