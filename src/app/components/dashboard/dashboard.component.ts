import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ProductService } from '../../services/product.service';
import { CategoryService } from '../../services/category.service';
import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { StatCardComponent } from '../ui/stat-card/stat-card.component';
import { computeStats, DashboardStats } from './dashboard-stats';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, SkeletonComponent, StatCardComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  isLoading = true;
  errorMessage = '';

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService
  ) { }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      products: this.productService.getAllProducts(true),
      categories: this.categoryService.getCategories()
    }).subscribe({
      next: ({ products, categories }) => {
        this.stats = computeStats(products, categories);
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Could not load the dashboard.';
        this.isLoading = false;
      }
    });
  }

  /** Whole-number percentage of `whole` (0 when there is nothing to divide). */
  percent(part: number, whole: number): number {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
  }
}
