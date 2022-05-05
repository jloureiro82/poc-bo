import { Directive, HostBinding, HostListener } from '@angular/core';
import { ManagedFormComponent } from '../managed-form/managed-form.component';

@Directive({
  selector: '[prevPage]'
})
export class PrevPageDirective {
  
  @HostBinding('hidden') hidden = true
  constructor(
    private form: ManagedFormComponent) {
      form.onChange((f:ManagedFormComponent) => {
        this.hidden = !f.hasPrev()
      })
  }

  @HostListener('click')
  onClick() {
    this.form.prevPage()
  }
}
