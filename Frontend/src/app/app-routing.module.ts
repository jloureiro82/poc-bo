import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FormLayoutSampleComponent } from './examples/form-layout-sample/form-layout-sample.component';
import { ReduxPageComponent } from './examples/redux/components/redux-page/redux-page.component';

const routes: Routes = [
  {
    path: 'form-layout-sample',
    component: FormLayoutSampleComponent
  },
  {
    path: 'redux',
    component: ReduxPageComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
