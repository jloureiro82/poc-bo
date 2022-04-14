import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicGridSampleComponent } from './dynamic-grid-sample.component';

describe('DynamicGridSampleComponent', () => {
  let component: DynamicGridSampleComponent;
  let fixture: ComponentFixture<DynamicGridSampleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DynamicGridSampleComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DynamicGridSampleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
