import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RepresentativeDataComponent } from './representative-data.component';

describe('RepresentativeDataComponent', () => {
  let component: RepresentativeDataComponent;
  let fixture: ComponentFixture<RepresentativeDataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RepresentativeDataComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RepresentativeDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
