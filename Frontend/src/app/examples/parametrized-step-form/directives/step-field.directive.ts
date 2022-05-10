import { Directive, Input, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';
import { FormStepDirective } from './form-step.directive';

@Directive({
  selector: '[mtcStepField]'
})
export class StepFieldDirective implements OnInit {

  @Input('mtcStepField') name!: string

  constructor(
    private form: FormStepDirective, 
    private viewContainer: ViewContainerRef,
    private templateRef: TemplateRef<any>) { }

  ngOnInit(): void {
    const field = this.form.getField(this.name)
    console.log('field seach: '+this.name, field)
  
    if (!!field) {
      this.viewContainer.createEmbeddedView(this.templateRef)
    } else {
      this.viewContainer.clear()
    }
  }

  field() {
    return this.form.getField(this.name)
  }
}
