import { Directive, Input, TemplateRef } from '@angular/core';

@Directive({
  selector: '[formStep]'
})
export class FormStepDirective {

  @Input('formStep') public title!: string

  constructor(public templateRef: TemplateRef<any>) { }

}
