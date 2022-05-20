import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MultistepRouterComponent } from './multistep-router.component';

describe('MultistepRouterComponent', () => {
  let component: MultistepRouterComponent;
  let fixture: ComponentFixture<MultistepRouterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MultistepRouterComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MultistepRouterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
