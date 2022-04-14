import { Component, ElementRef, Input, ViewChild } from '@angular/core';



@Component({
  selector: 'app-animated-image',
  templateUrl: './animated-image.component.html',
  styleUrls: ['./animated-image.component.css']
})
export class AnimatedImageComponent {

  @Input('src') src = '';

  constructor() { }



}
