import { Component, OnInit } from '@angular/core';
import { Route } from '@angular/router';
import { routes } from './app-routing.module';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  routes: Route[] = [];

  constructor() {
    this.routes = routes;
   }

  title = 'Onboarding';
}
