import { Directive, TemplateRef } from '@angular/core';

@Directive({
  selector: '[mcSideView]'
})
export class SideViewDirective {

  constructor(public template: TemplateRef<any>) { }

}
