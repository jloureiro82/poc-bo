import { Location } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReplaySubject, map, mergeMap, take } from 'rxjs'
import { FormNavigation } from '../model/form-navigation';
import { FormSetup } from '../model/form-setup';
import { ConfigStoreService } from '../services/config-store.service';

@Component({
  selector: 'managed-form',
  templateUrl: './managed-form.component.html',
  styleUrls: ['./managed-form.component.css']
})
export class ManagedFormComponent implements OnInit {
  
  public formSetup!: FormSetup
  private changeEmitter = new ReplaySubject<FormNavigation>(1)
  
  constructor(private service: ConfigStoreService, 
    private activatedRoute: ActivatedRoute, 
    private location: Location, 
    private router: Router) {
    this.activatedRoute.queryParamMap.pipe(
      take(1),
      map(params => params.get('type') || 'default'),
      mergeMap(type => this.service.getFormSetup(type)),
    )
    .subscribe(setup => {
      this.formSetup = setup
      this.activatedRoute.queryParamMap.subscribe(params => this.repath(params.get('step') || setup.navigation.pageId()))
      setup.navigation.changeObservable().subscribe(this.changeEmitter)
      setup.navigation.changeObservable().subscribe((v) => console.log('change emit', v))
    })
   }

  ngOnInit(): void { }

  repath(step: string) {
    this.formSetup.navigation.gotoStep(step)
    const queryParams = { step };
    this.router.navigate( [],
      {
        relativeTo: this.activatedRoute,
        queryParams: queryParams, 
        queryParamsHandling: 'merge', // remove to replace all query params by provided
      });
  }

  layoutName() {
    return this.formSetup?.certName
  }

  pageId() {
    return this.formSetup?.navigation.pageId()
  }
  
  onChange(fn: any) {
    this.changeEmitter.asObservable().subscribe(fn)
  }

  prevStep() {
    const nav = this.formSetup.navigation
    this.repath(nav.prev())
  }

  nextStep() {
    const nav = this.formSetup.navigation
    const configuration = this.formSetup.getConfig(nav.pageId())
    const subform = this.formSetup.subform(nav.pageId())
    const results = configuration.validations.map(validation => validation(subform)).filter(validation => validation !== null)
    console.log('value on next', results)
    if (results.length === 0 && subform.valid)
      this.repath(nav.next())
  }
}