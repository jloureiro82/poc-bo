import { Directive, Input, TemplateRef } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Directive({
  selector: '[formStep]'
})
export class FormStepDirective {

  constructor(public templateRef: TemplateRef<any>) { }

}
