import { Directive, HostBinding, HostListener } from '@angular/core';
import { ManagedFormComponent } from '../managed-form/managed-form.component';
import { FormNavigation } from '../model/form-navigation';

@Directive({
  selector: '[prevPage]'
})
export class PrevPageDirective {
  
  @HostBinding('hidden') hidden = true
  
  constructor(private form: ManagedFormComponent) {
      form.onChange((f:FormNavigation) => {
        this.hidden = !f.prev()
      })
  }

  @HostListener('click')
  onClick() {
    this.form.prevStep()
  }
}
