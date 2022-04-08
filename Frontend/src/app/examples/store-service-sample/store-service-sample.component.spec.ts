import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoreServiceSampleComponent } from './store-service-sample.component';

describe('StoreServiceSampleComponent', () => {
  let component: StoreServiceSampleComponent;
  let fixture: ComponentFixture<StoreServiceSampleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StoreServiceSampleComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StoreServiceSampleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
