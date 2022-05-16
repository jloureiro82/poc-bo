import { Directive, Input, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';
import { FieldConfig } from '../types';
import { FormStepDirective } from './form-step.directive';

@Directive({
  selector: '[mtcStepField]'
})
export class StepFieldDirective implements OnInit {

  @Input('mtcStepField') name!: string
  public fieldConfig!: FieldConfig
  constructor(
    private form: FormStepDirective, 
    private viewContainer: ViewContainerRef,
    private templateRef: TemplateRef<any>) { }

  ngOnInit(): void {
    this.fieldConfig = this.form.getFieldConfig(this.name)
    if (this.form.hasField(this.name)) {
      this.viewContainer.createEmbeddedView(this.templateRef)
    } else {
      this.viewContainer.clear()
    }
  }

  field() {
    return this.form.getField(this.name)
  }
}
