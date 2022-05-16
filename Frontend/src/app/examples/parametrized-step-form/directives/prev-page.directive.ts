import { Directive, HostBinding, HostListener } from '@angular/core';
import { ManagedFormComponent } from '../managed-form/managed-form.component';
import { FormNavigation } from '../services/config-store.service';

@Directive({
  selector: '[prevPage]'
})
export class PrevPageDirective {
  
  @HostBinding('hidden') hidden = true
  constructor(
    private form: ManagedFormComponent) {
      form.onChange((f:FormNavigation) => {
        this.hidden = !f.prev()
      })
  }

  @HostListener('click')
  onClick() {
    const nav = this.form.formSetup.navigation
    nav.gotoStep(nav.prev())
  }
}
