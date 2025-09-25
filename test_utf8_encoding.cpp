
#include <iostream>
#include <windows.h>
using namespace std;

int main() {
    // 设置控制台为UTF-8模式
    SetConsoleOutputCP(65001);
    SetConsoleCP(65001);
    
    cout << "=== UTF-8编码测试 ===" << endl;
    cout << "调试控制台编码测试：你好世界" << endl;
    cout << "中文测试：这是UTF-8编码" << endl;
    cout << "English test: Hello World" << endl;
    cout << "当前代码页: " << GetConsoleOutputCP() << endl;
    
    return 0;
}
