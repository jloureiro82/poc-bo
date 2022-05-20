import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MultistepService } from 'src/app/shared/multistep/multistep.service';

@Component({
  selector: 'app-multistep-router',
  templateUrl: './multistep-router.component.html',
  styleUrls: ['./multistep-router.component.css']
})
export class MultistepRouterComponent implements OnInit {
  public form2Data!: any;
  public product = { id:'1', name:"Angular"};

  constructor(private router : Router, private multistepService: MultistepService) { }

  async ngOnInit(): Promise<void> {
    // this.router.navigateByUrl('/multistep-router/form1', { state: this.product });
    // const a = await this.multistepService.getMultiStepFormData()
    console.log("await this.multistepService.getMultiStepFormData()");
    console.log(await this.multistepService.getFormData());
    this.form2Data = await this.multistepService.getFormData();
  }

}
