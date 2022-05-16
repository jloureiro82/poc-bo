import { Directive, HostBinding, HostListener, TemplateRef, ViewContainerRef, ViewRef } from '@angular/core';
import { ManagedFormComponent } from '../managed-form/managed-form.component';
import { FormNavigation } from '../services/config-store.service';


@Directive({
  selector: '[nextPage]'
})
export class NextPageDirective {
  
  @HostBinding('hidden') hidden = true
  constructor(
    private form: ManagedFormComponent) {
      form.onChange((f:FormNavigation) => {
        this.hidden = !f.next()
      })
  }

  @HostListener('click')
  onClick() {
    const nav = this.form.formSetup.navigation
    console.log('value on next', this.form.formSetup.form.value)
    nav.gotoStep(nav.next())
  }
}
