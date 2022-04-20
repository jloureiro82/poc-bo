import { Component, Input, OnInit } from '@angular/core';
import { StatusEnum } from './enums/StatusEnum';

type ClassName = 'red' | 'orange' | 'green' | 'grey';

@Component({
  selector: 'app-status',
  templateUrl: './status.component.html',
  styleUrls: ['./status.component.css']
})
export class StatusComponent implements OnInit {
  className!: ClassName;
 
   @Input()
   status!: String;

   ngOnInit(): void {
     this.className = this.mapValToClass(this.status);
   }
 
   private mapValToClass(val: String): ClassName {
     if(val === StatusEnum.TO_SUBMIT.valueOf()) {
       return 'red';
     } else if(val === StatusEnum.IN_ANALISYS.valueOf()) {
       return 'orange';
     } else if(val === StatusEnum.VALIDATED.valueOf()) {
       return 'green';
     }
     this.status = StatusEnum.NOT_FOUND;
     return 'grey';
   }
}
