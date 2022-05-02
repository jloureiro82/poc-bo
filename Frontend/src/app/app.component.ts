import { Component, OnInit } from '@angular/core';
import { Route } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { routes } from './app-routing.module';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  routes: Route[] = [];

  constructor(public translate: TranslateService) {
    this.routes = routes;
    // Register translation languages
    translate.addLangs(['en', 'pt', 'fr']);
    // Set default language
    translate.setDefaultLang('en');
   }

   translateLanguageTo(lang: string) {
    this.translate.use(lang);
  }

  title = 'Onboarding';
}
