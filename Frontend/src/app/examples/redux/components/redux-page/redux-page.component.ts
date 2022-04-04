import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { ExampleRequestAction } from '../../actions/example.action';

@Component({
  selector: 'app-redux-page',
  templateUrl: './redux-page.component.html',
  styleUrls: ['./redux-page.component.css']
})
export class ReduxPageComponent implements OnInit {

  requestValue = ''
  serverFeedback = 'init'
  loading = false
  constructor(private store: Store<any>) { }

  doRequest() {
    this.store.dispatch(new ExampleRequestAction(this.requestValue))
  }

  ngOnInit(): void {
    this.store.select('example').subscribe(state => {
      console.log('state change', state)
      this.serverFeedback = state.result
      this.loading = state.loading
    })
  }

}
