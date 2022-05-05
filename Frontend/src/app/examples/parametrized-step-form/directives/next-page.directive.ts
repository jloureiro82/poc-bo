import { Directive, HostBinding, HostListener, TemplateRef, ViewContainerRef, ViewRef } from '@angular/core';
import { ManagedFormComponent } from '../managed-form/managed-form.component';


@Directive({
  selector: '[nextPage]'
})
export class NextPageDirective {
  
  @HostBinding('hidden') hidden = true
  constructor(
    private form: ManagedFormComponent) {
      form.onChange((f:ManagedFormComponent) => {
        this.hidden = !f.hasNext()
      })
  }

  @HostListener('click')
  onClick() {
    this.form.nextPage()
  }
}
