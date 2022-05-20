import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { RootForm } from 'src/app/shared/multistep/models/multistep-route/RootForm';

@Component({
  selector: 'app-multistep',
  templateUrl: './multistep.component.html',
  styleUrls: ['./multistep.component.css']
})
export class MultistepComponent implements OnInit {
  public formData!: any;
  public form2Data!: any;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.http
      .get('/assets/multistep/my-form.json')
      .subscribe((formData) => {
        this.formData = formData; 
      });

      this.http
      .get<RootForm>('/assets/multistep/multistep-form.json')
      .subscribe((form2Data) => {
        this.form2Data = form2Data;
        console.log('MultistepComponent~: '+JSON.stringify(form2Data));
      });
  }
}

