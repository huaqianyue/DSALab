import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-welcome',
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss']
})
export class WelcomeComponent implements OnInit, AfterViewInit {

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    console.log('Welcome component initialized');
    // 获取路由参数
    this.route.params.subscribe(params => {
      console.log('Welcome component route params:', params);
    });
  }

  ngAfterViewInit(): void {
    console.log('Welcome component view initialized');
  }

}
