import { Directive, TemplateRef } from '@angular/core';

@Directive({
  selector: '[mcMainView]'
})
export class MainViewDirective {

  constructor(public template: TemplateRef<any>) { }

}
