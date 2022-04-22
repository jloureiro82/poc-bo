import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntityResponsableComponent } from './entity-responsable.component';

describe('EntityResponsableComponent', () => {
  let component: EntityResponsableComponent;
  let fixture: ComponentFixture<EntityResponsableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EntityResponsableComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EntityResponsableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
