import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DynamicGridSampleComponent } from './examples/dynamic-grid-sample/dynamic-grid-sample.component';
import { FormLayoutSampleComponent } from './examples/form-layout-sample/form-layout-sample.component';
import { ReduxPageComponent } from './examples/redux/components/redux-page/redux-page.component';
import { StoreServiceSampleComponent } from './examples/store-service-sample/store-service-sample.component';
import { LoginSampleComponent } from './examples/login-sample/login-sample.component';

const routes: Routes = [
  { path: 'form-layout-sample', component: FormLayoutSampleComponent },
  { path: 'dynamic-grid-sample', component: DynamicGridSampleComponent },
  { path: 'redux', component: ReduxPageComponent },
  { path: 'store-service', component: StoreServiceSampleComponent },
  { path: 'login-sample', component: LoginSampleComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
