import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReduxPageComponent } from './redux-page.component';

describe('ReduxPageComponent', () => {
  let component: ReduxPageComponent;
  let fixture: ComponentFixture<ReduxPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ReduxPageComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ReduxPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
