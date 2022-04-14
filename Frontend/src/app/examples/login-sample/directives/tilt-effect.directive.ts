import { Directive, ElementRef } from '@angular/core';
import UniversalTilt from 'universal-tilt.js'

@Directive({
  selector: '[appTiltEffect]'
})
export class TiltEffectDirective {

  constructor(private element: ElementRef) {
    console.log('tilt effect applied on ', element.nativeElement)
    UniversalTilt.init({
      elements: [element.nativeElement],
      settings: {
        scale: 1.1,
        shine: true,
        'shine-opacity': 1
      }
    })
   }

}
