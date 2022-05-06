import { Component, Input, OnInit } from '@angular/core';
import { Subject } from 'rxjs'

@Component({
  selector: 'app-managed-form',
  templateUrl: './managed-form.component.html',
  styleUrls: ['./managed-form.component.css']
})
export class ManagedFormComponent implements OnInit {


  private index = 0
  @Input('layout') layout!: FormLayout

  private changeEmitter = new Subject()

  constructor() { }

  ngOnInit(): void {
    this.changeEmitter.next(this)
  }

  hasPrev() {
    return this.index !== 0
  }

  hasNext() {
    console.log('next', this)
    return (this.index + 1) < this.layout.forms.length
  }

  layoutName() {
    console.log(this.layout)
    return this.layout.name
  }

  pageId() {
    return this.layout?.forms[this.index]?.name || 'default'
  }

  nextPage() {
    this.index += 1
    this.changeEmitter.next(this)
  }

  prevPage() {
    if (this.index > 0) {
      this.index -= 1
      this.changeEmitter.next(this)
    }
  }

  onChange(fn: any) {
    this.changeEmitter.asObservable().subscribe(fn)
  }

}
