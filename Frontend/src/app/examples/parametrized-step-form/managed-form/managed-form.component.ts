import { Component, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Subject } from 'rxjs'
import { ConfigStoreService } from '../services/config-store.service';

@Component({
  selector: 'managed-form',
  templateUrl: './managed-form.component.html',
  styleUrls: ['./managed-form.component.css']
})
export class ManagedFormComponent implements OnInit {

  @Input('type') type!: string
  public layout!: FormLayout
  
  private index = 0
  private changeEmitter = new Subject<ManagedFormComponent>()
  private form = new FormGroup({})

  constructor(private service: ConfigStoreService) { }

  ngOnInit(): void {
    this.service.getCertForm(this.type)
    .subscribe(cert => {
      this.layout = cert
      this.changeEmitter.next(this)
      console.log('resumo', this)
    })
  }

  layoutName() {
    return this.layout.name
  }
  
  pageId() {
    return this.layout?.forms[this.index]?.name || 'default'
  }

  getConfig(name: string) : Form {
    return this.layout.forms.filter(form => form.name === name)[0] || {name, fields: []}
  }

  subForm(name: string) {
    const subFrom = this.form.get(name) as FormGroup || new FormGroup({})
    this.form.addControl(name, subFrom)
    return subFrom
  }

  hasPrev() {
    return this.index > 0
  }

  hasNext() {
    return (this.index + 1) < this.layout.forms.length
  }
  
  nextPage() {
    if (this.hasNext()) {
      this.index += 1
      this.changeEmitter.next(this)
    }
  }

  prevPage() {
    if (this.hasPrev()) {
      this.index -= 1
      this.changeEmitter.next(this)
    }
  }

  onChange(fn: any) {
    this.changeEmitter.asObservable().subscribe(fn)
  }
}