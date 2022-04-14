import { Component, Input, OnInit } from '@angular/core';

type ClassName = 'red' | 'orange' | 'green';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.css']
})
export class StatusComponent implements OnInit {
  applyColor: String = ''

  className: ClassName = 'red';
 
   @Input()
   status!: String;

   ngOnInit(): void {
     this.className = this.mapValToClass(this.status);
   }
 
   private mapValToClass(val: String): ClassName {
     if(val === 'Por submeter') {
       return 'red';
     } else if(val === 'Em analise') {
       return 'orange';
     }
     return 'green';
   }
}
