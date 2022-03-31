import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormLayoutComponent } from './components/form-layout/form-layout.component';
import { MainViewDirective } from './directive/main-view.directive';
import { SideViewDirective } from './directive/side-view.directive';



@NgModule({
  declarations: [
    FormLayoutComponent,
    MainViewDirective,
    SideViewDirective
  ],
  imports: [
    CommonModule
  ],
  exports: [
    FormLayoutComponent,
    MainViewDirective,
    SideViewDirective
  ]
})
export class FormLayoutModule { }
