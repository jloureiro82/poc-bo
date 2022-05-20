import { Directive, Input, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';
import { StepFieldDirective } from './step-field.directive';

@Directive({
  selector: '[mtcFieldOption]'
})
export class FieldOptionDirective implements OnInit {

  @Input('mtcFieldOption') name!: string
  constructor(private stepField: StepFieldDirective,
              private viewContainer: ViewContainerRef,
              private templateRef: TemplateRef<any>) {

  }

  ngOnInit(): void {
    const hasOption = this.stepField.fieldConfig.options?.includes(this.name)
    if (!!hasOption) {
      this.viewContainer.createEmbeddedView(this.templateRef)
    } else {
      this.viewContainer.clear()
    }
  }

}
