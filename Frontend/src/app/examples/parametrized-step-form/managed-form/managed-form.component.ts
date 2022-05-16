import { Component, Input, OnInit } from '@angular/core';
import { Subject } from 'rxjs'
import { ConfigStoreService, FormNavigation, FormSetup } from '../services/config-store.service';

@Component({
  selector: 'managed-form',
  templateUrl: './managed-form.component.html',
  styleUrls: ['./managed-form.component.css']
})
export class ManagedFormComponent implements OnInit {

  @Input('type') type!: string
  public formSetup!: FormSetup
  private changeEmitter = new Subject<FormNavigation>()
  
  constructor(private service: ConfigStoreService) { }

  ngOnInit(): void {
    this.service.getFormSetup(this.type)
    .subscribe(setup => {
      this.formSetup = setup
      setup.navigation.changeObservable().subscribe(this.changeEmitter)
    })
  }

  layoutName() {
    return this.formSetup.certName
  }

  pageId() {
    return this.formSetup.navigation.pageId()
  }
  
  onChange(fn: any) {
    this.changeEmitter.asObservable().subscribe(fn)
  }
}